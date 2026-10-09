using System.Collections.Generic;
using System.Threading.Tasks;
using Contador_de_Historias.Models;
using Dapper;
using Npgsql;

namespace Contador_de_Historias.Repositories;

public class DatabaseRepository : IDatabaseRepository
{
    private readonly NpgsqlConnection _connection;

    public DatabaseRepository(NpgsqlConnection connection)
    {
        _connection = connection;
    }

    public async Task<IEnumerable<SessaoHistoria>> GetSessoesAsync()
    {
        string sql = "SELECT ID_Sessao, Nome_Personagem, Cenario_Contexto, Data_Criacao, Status FROM SessaoHistoria ORDER BY Data_Criacao DESC";
        return await _connection.QueryAsync<SessaoHistoria>(sql);
    }

    public async Task<SessaoHistoria> CriarSessaoAsync(string nomePersonagem, string cenarioContexto)
    {
        string sql = @"
            INSERT INTO SessaoHistoria (Nome_Personagem, Cenario_Contexto, Data_Criacao, Status) 
            VALUES (@NomePersonagem, @CenarioContexto, NOW(), 'Ativa')
            RETURNING ID_Sessao, Nome_Personagem, Cenario_Contexto, Data_Criacao, Status;";
        
        return await _connection.QuerySingleAsync<SessaoHistoria>(sql, new 
        { 
            NomePersonagem = nomePersonagem, 
            CenarioContexto = cenarioContexto 
        });
    }

    public async Task<string> GetContextoSessaoAsync(int idSessao)
    {
        string sql = "SELECT Cenario_Contexto FROM SessaoHistoria WHERE ID_Sessao = @IdSessao";
        return await _connection.QueryFirstOrDefaultAsync<string>(sql, new { IdSessao = idSessao }) ?? "";
    }

    public async Task<IEnumerable<MensagemChat>> GetHistoricoSessaoAsync(int idSessao)
    {
        string sql = "SELECT ID_Mensagem, Papel, Conteudo FROM MensagemChat WHERE ID_Sessao = @IdSessao ORDER BY ID_Mensagem ASC";
        return await _connection.QueryAsync<MensagemChat>(sql, new { IdSessao = idSessao });
    }

    public async Task<int> DeletarMensagensAposAsync(int idSessao, int idMensagem)
    {
        string sql = "DELETE FROM MensagemChat WHERE ID_Sessao = @IdSessao AND ID_Mensagem >= @IdMensagem";
        return await _connection.ExecuteAsync(sql, new { IdSessao = idSessao, IdMensagem = idMensagem });
    }

    public async Task SalvarMensagemAsync(int idSessao, string papel, string conteudo)
    {
        string sql = "INSERT INTO MensagemChat (ID_Sessao, Papel, Conteudo) VALUES (@IdSessao, @Papel, @Conteudo)";
        await _connection.ExecuteAsync(sql, new { IdSessao = idSessao, Papel = papel, Conteudo = conteudo });
    }

    public async Task DeletarSessaoAsync(int idSessao)
    {
        string sql = "DELETE FROM SessaoHistoria WHERE ID_Sessao = @IdSessao";
        await _connection.ExecuteAsync(sql, new { IdSessao = idSessao });
    }
}
